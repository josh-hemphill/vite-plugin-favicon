import type { Plugin, HtmlTagDescriptor, ResolvedConfig } from 'vite';
import type { PluginContext } from 'rollup';
import favicons from 'favicons';
import Oracle from './oracle.js';
import path from 'path';
import { getDefaultFaviconConfig } from './faviconsDefaults.js';
import { parseFragment } from 'parse5';
import type { FaviconOptions } from './faviconsTypes.js';

type FaviconsConfig = Partial<FaviconOptions>
export type ViteFaviconsPluginOptions = {
	/** Your source logo (Will default to )
		@default "assets/logo.png"
	 */
	logo?: string,
	/** Inject html links/metadata.
		@default true
	 */
	inject?: boolean,
	/** `Favicons` configuration options
	 *  - [See `favicons` documentation](https://github.com/itgalaxy/favicons)
	*/
	favicons?: FaviconsConfig,
	/** The root of the project from which you want to load metadata
		@default process.cwd()
	 */
	projectRoot?: string,
	/** prefix is delegated to Rollup/Vite (keeping for people migrating from Webpack)
	 * @deprecated
	*/
	prefix?: string,
	/** Caching is delegated to Rollup/Vite (keeping for people migrating from Webpack)
	 * @deprecated
	*/
	cache?: boolean,
	/** Public Path is delegated to Rollup/Vite (keeping for people migrating from Webpack)
	 * @deprecated
	*/
	publicPath?: string,
	/** Output Path is delegated to Rollup/Vite (keeping for people migrating from Webpack)
	 * @deprecated
	*/
	outputPath?: string,
}

class HtmlTag implements HtmlTagDescriptor {
	tag: string
	attrs: Record<string,string|boolean>;
	constructor (tag: string, attrs: Record<string,string|boolean>) {
		this.tag = tag;
		this.attrs = attrs;
	}
}

type FaviconsPluginArgs = Partial<ViteFaviconsPluginOptions> | ViteFaviconsPluginOptions['logo']

export const ViteFaviconsPlugin = (options: FaviconsPluginArgs = {} ): Plugin => {
	let viteConfig: ResolvedConfig;
	const lOptions = typeof options === 'string' ? {logo:options} : options;
	lOptions.inject = lOptions.inject === undefined ? true : lOptions.inject;
	lOptions.projectRoot = lOptions.projectRoot === undefined ? process.cwd() : lOptions.projectRoot;
	const LOGO_PATH = path.resolve(lOptions.logo || path.join('assets','logo.png'));
	const oracle = new Oracle(lOptions.projectRoot);
	const {
		appName = oracle.guessAppName(),
		appDescription = oracle.guessDescription(),
		version = oracle.guessVersion(),
		developerName = oracle.guessDeveloperName(),
		developerURL = oracle.guessDeveloperURL(),
	} = lOptions.favicons || {};
	lOptions.favicons = lOptions.favicons || {};
	Object.assign(lOptions.favicons, {
		appName,
		appDescription,
		version,
		developerName,
		developerURL,
	});
	const getFavicons = async () => {
		if (lOptions && lOptions.favicons) {
			lOptions.favicons.path = path.join(viteConfig.base, viteConfig.build.assetsDir);
		}
		const faviconConfig = getDefaultFaviconConfig(lOptions);
		return await favicons(LOGO_PATH,faviconConfig);
	};

	const tags: HtmlTag[] = [];
	const assetIds: Map<string,string> = new Map();

	const rebuildFavicons = async (ctx: PluginContext) => {
		ctx.addWatchFile(LOGO_PATH);
		const res = await getFavicons();
		// Only emit files if we're doing a build
		if (viteConfig.command === 'build') {
			for (const {name, contents} of res.files) {
				assetIds.set(name, ctx.emitFile({type: 'asset', fileName: name, source: contents}));
			}
			for (const {name, contents} of res.images) {
				assetIds.set(name, ctx.emitFile({type: 'asset', name, source: contents}));
			}
			if (!lOptions.inject) {
				const name = 'webapp.html';
				const contents = res.html.join("\n");
				assetIds.set(name, ctx.emitFile({type: 'asset', fileName: name, source: contents}));
			}
		}
		// Parse the HTML into tag objects for later injection
		for (const tag of res.html) {
			const node = <{nodeName:string, attrs: [{name: string,value:string}]}><unknown>parseFragment(tag).childNodes[0];
			tags.push(new HtmlTag(node.nodeName,node.attrs.reduce((acc,v) => {
				const resolvedValue = assetIds.has(v.value.slice(1))
					? assetIds.get(v.value.slice(1)) || v.value
					: v.value;
				acc[v.name] = resolvedValue;
				return acc;
			},<Record<string,string>>{})));
		}
	};

	return {
		name: 'vite-plugin-favicon',
		async buildStart () {
			await rebuildFavicons(this);
		},
		configResolved(resolvedConfig: ResolvedConfig) {
			viteConfig = resolvedConfig;
		},
		transformIndexHtml () {
			if (lOptions.inject) {
				return tags;
			}
		},
	};
};
export default ViteFaviconsPlugin;
