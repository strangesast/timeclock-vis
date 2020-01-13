const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const WorkerPlugin = require('worker-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const package = require('./package.json')

module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
    simple: './src/simple.ts',
    each: './src/each.ts',
    worker: './src/data.worker.ts',
    vendor: Object.keys(package.dependencies),
  },
  plugins: [
    ...['index', 'simple', 'each'].map(key => new HtmlWebpackPlugin({
      title: key[0].toUpperCase() + key.slice(1),
      chunks: ['vendor', key],
      template: `src/${key}.html`,
      filename: `${key}.html`,
    })),
    new WorkerPlugin(),
    new CopyPlugin([
      {from: 'icons', to: 'icons'},
      {from: 'data/*.json'},
      {from: 'manifest.json'},
    ]),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      { test: /\.css$/, loader: "style-loader!css-loader" },
      { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader?limit=100000' },
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: '[name].bundle.js',
  }
};
