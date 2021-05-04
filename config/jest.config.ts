import type {Config } from '@jest/types';
import {jsWithTs} from 'ts-jest/presets';
const config: Config.InitialOptions = {
	'rootDir':'../',
	'preset': 'ts-jest/presets/js-with-ts',
	testEnvironment: 'node',
	moduleFileExtensions: ['ts', 'js'],
	'testMatch': [
		'**/src/**/*.test.[tj]s',
		'**/test*/**/*.[tj]s',
	],
	'transform': {
		...jsWithTs.transform,
	},
	'coverageReporters': [
		'text-summary',
		"json", "lcov", "text", "clover"
	],
	'bail': true,
	globals: {
		'ts-jest': {
		},
	},
};
export default config;
