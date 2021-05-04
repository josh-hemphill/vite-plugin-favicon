import path from 'path';
import findRoot from 'find-root';
import parseAuthor from 'parse-author';
type pack = Partial<typeof import('../package.json')>
type nString = string | undefined
export default class Oracle {
	pkg: pack;
	constructor (startingPath: string) {
		try {
			this.pkg = require(path.join(findRoot(startingPath), 'package.json'));
		} catch (_) {
			this.pkg = {};
		}
	}

	/**
	 * Tries to guess the name from package.json
	 */
	guessAppName (): nString {
		return this.pkg.name;
	}

	/**
	 * Tries to guess the description from package.json
	 */
	guessDescription (): nString {
		return this.pkg.description;
	}

	/**
	 * Tries to guess the version from package.json
	 */
	guessVersion (): nString {
		return this.pkg.version;
	}

	/**
	 * Tries to guess the developer {name, email, url} from package.json
	 */
	guessDeveloper (): {name?: nString, email?: nString, url?: nString} {
		let author = typeof this.pkg.author === 'string'
			? parseAuthor(this.pkg.author)
			: typeof this.pkg.author === 'object' && this.pkg.author
				? {
					name: this.pkg.author.name,
					email: this.pkg.author?.email,
					url: this.pkg.author?.url,
				}
				: {};
		if (!Object.keys(author).length){
			if (Array.isArray(this.pkg.maintainers) && this.pkg.maintainers.length) {
				const maintainer = this.pkg.maintainers[0];
				author = typeof maintainer === 'string'
					? parseAuthor(<string>(<unknown>this.pkg.maintainers[0]))
					: typeof maintainer === 'object' && maintainer
						? {
							name: maintainer.name,
							email: maintainer?.email,
							url: maintainer?.url,
						}
						: {};
			}
		}
		return author;
	}

	/**
	 * Tries to guess the developer name from package.json
	 */
	guessDeveloperName (): string | undefined {
		return this.guessDeveloper().name;
	}

	/**
	 * Tries to guess the developer URL from package.json
	 */
	guessDeveloperURL (): string | undefined {
		return this.guessDeveloper().url;
	}
}
