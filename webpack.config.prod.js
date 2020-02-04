const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const {DefinePlugin} = require('webpack');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'production',
  plugins: [
    new DefinePlugin({
    	DEV: JSON.stringify('false'),
    }),
    new BundleAnalyzerPlugin({analyzerMode: 'disabled', generateStatsFile: true}),
  ],
});
