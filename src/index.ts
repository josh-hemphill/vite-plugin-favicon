import type { Plugin, HtmlTagDescriptor } from 'vite';
import type { PluginContext } from 'rollup';
import favicons from 'favicons';
import Oracle from './oracle.js';
import path from 'path';
import { getDefaultFaviconConfig } from './faviconsDefaults.js';
import { parseFragment } from 'parse5';

type FaviconsConfig = favicons.FaviconOptions
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

export const ViteFaviconsPlugin = (options: Partial<ViteFaviconsPluginOptions>): Plugin => {
	const lOptions = options;
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
	Object.assign(lOptions.favicons, {
		appName,
		appDescription,
		version,
		developerName,
		developerURL,
	});
	const faviconConfig = getDefaultFaviconConfig(lOptions);
	const getFavicons = async () => {
		return await favicons(LOGO_PATH,faviconConfig);
	};

	const tags: HtmlTag[] = [];
	const assetIds: Set<string> = new Set();

	const rebuildFavicons = async (ctx: PluginContext) => {
		ctx.addWatchFile(LOGO_PATH);
		const res = await getFavicons();
		for (const {name,contents} of res.files) {
			assetIds.add(ctx.emitFile({type:'asset',name,source:contents}));
		}
		for (const {name,contents} of res.images) {
			assetIds.add(ctx.emitFile({type:'asset',name,source:contents}));
		}
		for (const tag of res.html) {
			const node = <{nodeName:string, attrs: [{name: string,value:string}]}><unknown>parseFragment(tag).childNodes[0];
			tags.push(new HtmlTag(node.nodeName,node.attrs.reduce((acc,v) => {
				acc[v.name] = v.value;
				return acc;
			},<Record<string,string>>{})));
		}
	};

	return {
		name: 'vite-plugin-favicon',
		async buildStart () {
			await rebuildFavicons(this);
		},
		load ( id ) {
			if (id === 'virtual-module') {
				return 'export default "This is virtual!"'; // the source code for "virtual-module"
			}
			return null; // other ids should be handled as usually
		},
		transformIndexHtml () {
			if (lOptions.inject) {
				return tags;
			}
		},
	};
};
export default ViteFaviconsPlugin;
