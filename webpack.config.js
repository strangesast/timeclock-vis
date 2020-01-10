const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')
const package = require('./package.json')


module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
    simple: './src/simple.ts',
    vendor: Object.keys(package.dependencies),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Timeclock',
      chunks: ['vendor', 'index'],
      template: 'src/index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      title: 'Simple',
      chunks: ['vendor', 'simple'],
      template: 'src/simple.html',
      filename: 'simple.html',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      { test: /\.css$/, loader: "style-loader!css-loader" },
      { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader?limit=100000' }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: '[name].bundle.js',
  }
};
