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
          DEFAULT: '#012A7A',
          50: '#EEF3FF',
          100: '#D9E5FF',
          200: '#B8CFFF',
          300: '#8AB0FF',
          400: '#4F84F6',
          500: '#014EBA',
          600: '#013696',
          700: '#012A7A',
          800: '#021D60',
          900: '#021144',
        },
        accent: {
          DEFAULT: '#FF6A03',
          50: '#FFF4ED',
          100: '#FFE6D5',
          200: '#FFCAAB',
          300: '#FFA574',
          400: '#FF7D38',
          500: '#FF6A03',
          600: '#E55800',
          700: '#BF4500',
          800: '#993700',
          900: '#7A2D04',
        },
        background: '#F8FAFC',
        surface: '#FFFFFF',
        'text-primary': '#0F172A',
        'text-muted': '#475569',
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
        'card': '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'card-hover': '0 10px 24px -4px rgba(1, 42, 122, 0.12), 0 4px 10px -2px rgba(1, 42, 122, 0.05)',
        'focus': '0 0 0 3px rgba(255, 106, 3, 0.25)',
      },
    },
  },
  plugins: [],
}
