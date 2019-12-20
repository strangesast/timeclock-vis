const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')


module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Timeclock',
      template: 'src/index.html'
    })
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
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};
