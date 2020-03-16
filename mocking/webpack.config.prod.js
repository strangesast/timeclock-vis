const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = merge(baseConfig, {
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
});
