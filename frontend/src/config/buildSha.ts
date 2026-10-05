// Pure helper for the Vite `transformIndexHtml` hook that stamps the build SHA
// into the `erp-build` meta tag. Do not rely on `%VITE_BUILD_SHA%`
// substitution: Vite leaves the literal in place when the variable is unset.
export function writeBuildSha(html: string, sha: string | undefined): string {
  const value = sha && sha.length > 0 ? sha : 'unknown'
  if (/name="erp-build"/.test(html)) {
    return html.replace(
      /(<meta\s+name="erp-build"\s+content=")[^"]*(")/,
      `$1${value}$2`,
    )
  }
  return html.replace('</head>', `  <meta name="erp-build" content="${value}" />\n  </head>`)
}
