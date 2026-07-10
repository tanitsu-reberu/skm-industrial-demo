/**
 * Safe paint fallback while the versioned stylesheet is loading.
 *
 * Keep this limited to element defaults. Re-declaring Tailwind utility classes
 * here would place them after the main stylesheet and override responsive
 * variants such as `sm:flex-row` on tablets and laptops.
 */
export const criticalCss = `
html{background:#0a0a0a;color-scheme:dark;-webkit-text-size-adjust:100%;text-size-adjust:100%}
html,body{margin:0;min-height:100%;overflow-x:hidden}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
*,*::before,*::after{box-sizing:border-box}
img{max-width:100%;height:auto}
a{color:inherit;text-decoration:none}
button,input,textarea,select{font:inherit}
`.trim();
