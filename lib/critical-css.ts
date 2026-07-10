/** Minimal layout/colors inlined in <head> so iPad/Safari still looks correct if the main CSS chunk is delayed. */
export const criticalCss = `
html,body{background:#0a0a0a;color:#fff;margin:0;min-height:100%;overflow-x:hidden}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
*,*::before,*::after{box-sizing:border-box}
img{max-width:100%;height:auto}
a{color:inherit;text-decoration:none}
.flex{display:flex}.flex-col{flex-direction:column}.min-h-screen{min-height:100vh}
.items-center{align-items:center}.justify-between{justify-content:space-between}
.sticky{position:sticky}.top-0{top:0}.z-40{z-index:40}
.border-b{border-bottom:1px solid #27272a}
.text-white{color:#fff}.text-muted{color:#a1a1aa}
.rounded-md{border-radius:6px}.border{border:1px solid #27272a}
.bg-card{background-color:#18181b}.bg-primary{background-color:#e30613}
.inline-flex{display:inline-flex}.font-semibold{font-weight:600}
button,input,textarea{font:inherit}
@media(min-width:768px) and (max-width:1023px){
.section-shell{padding-left:max(2rem,env(safe-area-inset-left));padding-right:max(2rem,env(safe-area-inset-right))}
}
`.trim();