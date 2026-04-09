import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        pretendard: ['var(--font-pretendard)'],
      },
      colors: {
        siru: {
          bg: '#302328',         // Muted Dark Mauve
          panel: '#3A272D',      // Soft Dark Rose
          base: '#2A2322',       // Warm Dark Cocoa
          primary: '#FCD6E5',    // Soft Pink
          secondary: '#FCE6A3',  // Pastel Yellow
          text: '#F5F5F7',       // Off-White
        }
      },
      boxShadow: {
        'siru-glow': '0 0 20px rgba(252, 214, 229, 0.3)', // Soft Pink glow
      }
    },
  },
  plugins: [],
}

export default config