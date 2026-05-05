14:08:18.765 Running build in Washington, D.C., USA (East) – iad1
14:08:18.766 Build machine configuration: 2 cores, 8 GB
14:08:18.892 Cloning github.com/aviuzzan/TalmidApp (Branch: main, Commit: a2dc334)
14:08:19.745 Cloning completed: 853.000ms
14:08:20.177 Restored build cache from previous deployment (B8XNP53uQwdrb7jg4RpAGHBWqZLa)
14:08:20.377 Running "vercel build"
14:08:21.045 Vercel CLI 51.6.1
14:08:21.327 Installing dependencies...
14:08:26.614 
14:08:26.614 up to date in 5s
14:08:26.614 
14:08:26.614 140 packages are looking for funding
14:08:26.615   run `npm fund` for details
14:08:26.646 Detected Next.js version: 14.2.29
14:08:26.651 Running "npm run build"
14:08:26.753 
14:08:26.753 > talmidapp@0.1.0 build
14:08:26.753 > next build
14:08:26.753 
14:08:27.436   ▲ Next.js 14.2.29
14:08:27.437 
14:08:27.456    Creating an optimized production build ...
14:08:30.964 Failed to compile.
14:08:30.964 
14:08:30.965 ./src/app/[ecole]/inscriptions/page.tsx
14:08:30.965 Error: 
14:08:30.965   [31mx[0m Unexpected token `div`. Expected jsx identifier
14:08:30.965      ,-[[36;1;4m/vercel/path0/src/app/[ecole]/inscriptions/page.tsx[0m:355:1]
14:08:30.965  [2m355[0m |   const sorted = [...liste].sort((a, b) => (STATUT_PRIORITY[a.statut as keyof typeof STATUT_PRIORITY] ?? 9) - (STATUT_PRIORITY[b.statut as keyof typeof STATUT_PRIORITY] ?? 9))
14:08:30.966  [2m356[0m | 
14:08:30.966  [2m357[0m |   return (
14:08:30.966  [2m358[0m |     <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
14:08:30.966      : [31;1m     ^^^[0m
14:08:30.966  [2m359[0m |       {/* Compteurs par statut */}
14:08:30.966  [2m360[0m |       <div style={{ display: 'flex', gap: 10 }}>
14:08:30.966  [2m361[0m |         {[
14:08:30.967      `----
14:08:30.967 
14:08:30.967 Caused by:
14:08:30.967     Syntax Error
14:08:30.967 
14:08:30.967 Import trace for requested module:
14:08:30.967 ./src/app/[ecole]/inscriptions/page.tsx
14:08:30.967 
14:08:30.979 
14:08:30.979 > Build failed because of webpack errors
14:08:31.010 Error: Command "npm run build" exited with 1
