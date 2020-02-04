const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const path = require('path');
const {DefinePlugin} = require('webpack');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'development',
  plugins: [
    new DefinePlugin({
    	MODE: JSON.stringify('development'),
    }),
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
  ],
  devServer: {
    hot: true,
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
