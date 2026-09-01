module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    './public/**/*.html',
    './public/**/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        feast: {
          red: '#7f1d1d',
          amber: '#fbbf24',
          green: '#25D366'
        }
      }
    }
  },
  plugins: []
};