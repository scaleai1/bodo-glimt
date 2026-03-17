/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'electric-yellow': '#d97706',
        'yellow-glow':     '#b45309',
        'deep-black':      '#080808',
        'pitch-dark':      '#111111',
        'card-dark':       '#1A1A1A',
        'border-dark':     '#2A2A2A',
        'danger-red':      '#be123c',
        'success-green':   '#059669',
        'muted-gray':      '#5A5A5A',
        'text-secondary':  '#9A9A9A',
      },
      fontFamily: {
        display: ['Impact', 'Arial Black', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'yellow-glow': '0 0 16px rgba(217,119,6,0.35), 0 0 40px rgba(217,119,6,0.12)',
        'yellow-sm':   '0 0 8px rgba(217,119,6,0.4)',
        'red-glow':    '0 0 16px rgba(190,18,60,0.45)',
        'green-glow':  '0 0 12px rgba(5,150,105,0.35)',
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
          '0%, 100%': { boxShadow: '0 0 6px rgba(190,18,60,0.2)' },
          '50%':      { boxShadow: '0 0 20px rgba(190,18,60,0.6)' },
        },
        'glow-yellow': {
          '0%':   { boxShadow: '0 0 6px rgba(217,119,6,0.2)' },
          '100%': { boxShadow: '0 0 24px rgba(217,119,6,0.55)' },
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

