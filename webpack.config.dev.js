const merge = require('webpack-merge');
const baseConfig = require('./webpack.config.base.js');
const path = require('path');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

module.exports = merge(baseConfig, {
  mode: 'development',
  plugins: [
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
  ],
  devServer: {
    hot: true,
    port: 8080,
    host: '0.0.0.0',
    compress: true,
    disableHostCheck: true,
    contentBase: path.join(__dirname, 'dist'),
  },
});
