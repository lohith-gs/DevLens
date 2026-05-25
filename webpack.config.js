const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: {
    devtools: './src/devtools.ts',
    background: './src/background.ts',
    panel: './src/panel/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: '[name].css' }),
    new HtmlWebpackPlugin({
      template: './src/devtools.html',
      filename: 'devtools.html',
      chunks: ['devtools'],
    }),
    new HtmlWebpackPlugin({
      template: './src/panel/index.html',
      filename: 'panel/index.html',
      chunks: ['panel'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './src/manifest.json', to: 'manifest.json' },
        { from: './src/icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],
};
