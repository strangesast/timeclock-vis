const path = require('path');
const merge = require('webpack-merge');
const {DefinePlugin} = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const baseConfig = require('./webpack.config.base.js');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'development',
  plugins: [
    new DefinePlugin({
    	DEV: true,
    }),
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
    new CopyPlugin([
      {from: 'icons', to: 'icons'},
      {from: 'data/*.json'},
      {from: 'manifest.json'},
    ]),
  ],
  devServer: {
    port: 8081,
    host: '0.0.0.0',
    compress: true,
    disableHostCheck: true,
    contentBase: path.join(__dirname, 'dist'),
    proxy: {
      '/socket': {
         target: 'ws://localhost:8080',
         ws: true
      },
    },
  },
});
