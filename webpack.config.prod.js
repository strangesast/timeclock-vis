const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const {DefinePlugin} = require('webpack');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'production',
  plugins: [
    new DefinePlugin({
    	MODE: JSON.stringify('production'),
    }),
    new BundleAnalyzerPlugin({analyzerMode: 'disabled', generateStatsFile: true}),
  ],
});
