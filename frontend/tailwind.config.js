/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#142D4E',
          50: '#E8EDF3',
          100: '#C5D1DF',
          200: '#9FB3CA',
          300: '#7895B5',
          400: '#517AA1',
          500: '#142D4E',
          600: '#112640',
          700: '#0D1E33',
          800: '#091625',
          900: '#050E18',
        },
        accent: {
          DEFAULT: '#13A89E',
          50: '#E6F7F6',
          100: '#B3E8E5',
          200: '#80D9D4',
          300: '#4DCAC3',
          400: '#1ABBB3',
          500: '#13A89E',
          600: '#0F8D84',
          700: '#0C726B',
          800: '#085751',
          900: '#043C38',
        },
        background: '#F7F9FC',
        surface: '#FFFFFF',
        'text-primary': '#172B43',
        'text-muted': '#64748B',
        border: '#E2E8F0',
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(20,45,78,0.12)',
        'focus': '0 0 0 3px rgba(19,168,158,0.25)',
      },
    },
  },
  plugins: [],
}
