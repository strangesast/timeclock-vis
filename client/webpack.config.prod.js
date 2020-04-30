const merge = require('webpack-merge');
const {DefinePlugin} = require('webpack');
const baseConfig = require('./webpack.config.base.js');
const TerserPlugin = require('terser-webpack-plugin');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'production',
  plugins: [
    // new BundleAnalyzerPlugin({analyzerMode: 'disabled', generateStatsFile: true}),
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
});
