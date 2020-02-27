const path = require('path');
const merge = require('webpack-merge');
const CopyPlugin = require('copy-webpack-plugin');
const baseConfig = require('./webpack.config.base.js');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'development',
  plugins: [
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
    new CopyPlugin([ {from: 'static', to: 'static'}, ]),
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
