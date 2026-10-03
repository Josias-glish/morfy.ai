# morfy.ai

Página de morfy. Sitio estático (HTML, CSS y JS, sin paso de build) publicado en Netlify: https://morfy-js.netlify.app

## Seguridad

- **No hay claves ni secretos en el repositorio.** El sitio no usa APIs con clave. Si algún día hace falta una, va en una variable de entorno de Netlify (Site configuration → Environment variables) y se usa desde una Netlify Function, nunca desde `script.js`. Los archivos `.env` están en `.gitignore`.
- **Cabeceras y CSP** viven en `netlify.toml`. La CSP solo permite lo que el sitio usa: sus propios archivos, cdnjs (GSAP), jsDelivr (Three.js) y Google Fonts.
- **Si editas un `<script>` inline de `index.html`** hay que recalcular su hash `sha256` y actualizarlo en `Content-Security-Policy` (`script-src`) de `netlify.toml`; si no, el navegador lo bloquea. La consola del navegador muestra el hash correcto en el error "Refused to execute inline script".
- **Si agregas un recurso externo nuevo** (otro CDN, fuente o imagen de otro dominio), agrega ese dominio a la directiva que corresponda de la CSP.
- `netlify.toml` y `README.md` devuelven 404 en la web.
- Antes de publicar cambios, abre el Deploy Preview del pull request: la consola del navegador no debe mostrar errores "Refused to…", y las cabeceras se revisan en https://securityheaders.com.
