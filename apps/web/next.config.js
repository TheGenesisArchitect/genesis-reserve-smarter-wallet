const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Use a dedicated local build directory for local builds; Vercel uses default .next.
	distDir: process.env.VERCEL ? '.next' : '.next-local',
	typescript: {
		// viem 2.x ships types via package.json exports; tsc resolves _esm/ without them
		// in this TS 5.9 / Next 14.2 combo. Runtime is unaffected — webpack resolves fine.
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	experimental: {
		webpackBuildWorker: false,
	},
	webpack: (config) => {
		config.resolve = config.resolve || {}
		config.resolve.alias = config.resolve.alias || {}
		config.resolve.alias['@react-native-async-storage/async-storage'] = path.resolve(
			__dirname,
			'src/shims/asyncStorage.ts'
		)
		return config
	},
}

module.exports = nextConfig
