const path = require('path');
const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'development',
  plugins: [
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
  ],
  devtool: 'source-map',
  devServer: {
    port: 8080,
    host: '0.0.0.0',
    compress: true,
    disableHostCheck: true,
    proxy: {
      '/socket': {
         target: 'ws://localhost:8082',
         ws: true
      },
      '/data': {
         target: 'http://localhost:8081',
      },
    },
  },
});
