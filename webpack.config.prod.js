const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'production',
  plugins: [
    new BundleAnalyzerPlugin({analyzerMode: 'disabled', generateStatsFile: true}),
  ],
});
