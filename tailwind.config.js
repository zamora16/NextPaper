const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

// Colors are CSS variables (see style.css) so the whole interface follows the
// system's light/dark setting from one place.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "media",
  content: ["./**/*.{tsx,html}", "!./node_modules/**", "!./build/**"],
  theme: {
    extend: {
      colors: {
        paper: token("paper"),
        surface: token("surface"),
        sunken: token("sunken"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        soft: token("soft"),
        muted: token("muted"),
        accent: token("accent"),
        "accent-hi": token("accent-hi"),
        "accent-soft": token("accent-soft"),
        "accent-ink": token("accent-ink"),
        ok: token("ok"),
        "ok-soft": token("ok-soft"),
        info: token("info"),
        "info-soft": token("info-soft"),
        warn: token("warn"),
        "warn-soft": token("warn-soft"),
        teal: token("teal"),
        "teal-soft": token("teal-soft"),
        danger: token("danger"),
        "danger-soft": token("danger-soft")
      },
      borderColor: { DEFAULT: token("line") },
      fontFamily: {
        // Paper titles are set like a journal's: a serif that ships with the OS.
        serif: [
          '"Iowan Old Style"',
          '"Palatino Linotype"',
          "Palatino",
          "Charter",
          "Georgia",
          "serif"
        ],
        sans: [
          "system-ui",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--ink) / 0.05), 0 0 0 1px rgb(var(--line) / 0.4)",
        pop: "0 8px 24px rgb(var(--ink) / 0.14)"
      }
    }
  },
  plugins: []
}
