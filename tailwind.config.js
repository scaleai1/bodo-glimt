/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'electric-yellow': '#FFE500',
        'yellow-glow':     '#FFD700',
        'deep-black':      '#080808',
        'pitch-dark':      '#111111',
        'card-dark':       '#1A1A1A',
        'border-dark':     '#2A2A2A',
        'danger-red':      '#FF2D2D',
        'success-green':   '#00FF6A',
        'muted-gray':      '#5A5A5A',
        'text-secondary':  '#9A9A9A',
      },
      fontFamily: {
        display: ['Impact', 'Arial Black', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'yellow-glow': '0 0 20px rgba(255,229,0,0.45), 0 0 60px rgba(255,229,0,0.15)',
        'yellow-sm':   '0 0 8px rgba(255,229,0,0.5)',
        'red-glow':    '0 0 20px rgba(255,45,45,0.55)',
        'green-glow':  '0 0 16px rgba(0,255,106,0.4)',
      },
      animation: {
        'pulse-red':   'pulse-red 1.5s ease-in-out infinite',
        'glow-yellow': 'glow-yellow 2s ease-in-out infinite alternate',
        'drip':        'drip 1.8s ease-in-out infinite',
        'slide-in':    'slide-in 0.4s ease-out',
        'ekg-line':    'ekg-line 3s linear infinite',
        'flatline':    'flatline 0.6s ease-out forwards',
      },
      keyframes: {
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(255,45,45,0.3)' },
          '50%':      { boxShadow: '0 0 30px rgba(255,45,45,0.9)' },
        },
        'glow-yellow': {
          '0%':   { boxShadow: '0 0 10px rgba(255,229,0,0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(255,229,0,0.75)' },
        },
        'drip': {
          '0%':   { transform: 'translateY(-4px)', opacity: '0' },
          '50%':  { opacity: '1' },
          '100%': { transform: 'translateY(14px)', opacity: '0' },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',      opacity: '1' },
        },
        'ekg-line': {
          '0%':   { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        'flatline': {
          '0%':   { transform: 'scaleY(1)' },
          '100%': { transform: 'scaleY(0.05)' },
        },
      },
    },
  },
  plugins: [],
}

