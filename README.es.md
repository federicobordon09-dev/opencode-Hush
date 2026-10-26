# Hush

Telemetría mínima para el TUI de [OpenCode](https://opencode.ai): presión de la ventana de contexto, rama de Git y las métricas de sesión que el host no dibuja. Silencioso mientras todo está bien, específico cuando algo requiere atención.

> 🇬🇧 [Read in English](./README.md)

## Instalación

```sh
opencode plugin add opencode-hush
```

Reiniciá OpenCode después. La primera carga puede tardar cerca de un minuto mientras el host descarga y precompila el plugin.

<table>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/federicobordon09-dev/opencode-Hush/main/docs/design/hush-tema-claro.png" alt="Panel lateral de Hush en un tema claro de OpenCode" /></td>
    <td align="center"><img src="https://raw.githubusercontent.com/federicobordon09-dev/opencode-Hush/main/docs/design/hush-tema-oscuro.png" alt="Panel lateral de Hush en un tema oscuro de OpenCode" /></td>
  </tr>
</table>

## Qué muestra

- **Contexto** — barra de presión y límite del modelo (del último mensaje del asistente con uso; límite desde `ModelInfo.limit.context`).
- **Git** — rama actual (`data.location.vcs.info()`).
- **Meta** — modelo, costo de la familia, tokens de la familia, tokens en caché, tiempo transcurrido, razonamiento activo.
- **Subagentes** — una fila por sesión de subagente (estado, nombre, modelo y tarea), primero el trabajo en curso, hasta seis.

Las secciones sin datos no se renderizan. Todas las cifras provienen del contexto del plugin; nada se estima ni se obtiene fuera del runtime local.

## Comandos

- **Buscar actualizaciones** — `Hush: check for updates` en la paleta de comandos, o `/hush-update` en el prompt. Hush consulta la API de plugins del host si npm tiene una versión más nueva y, al confirmar, la instala. Reiniciá OpenCode para cargar el código nuevo.

## Requisitos

- Node.js 22.18+
- OpenCode 2.1.x

## Desarrollo

```sh
pnpm install
pnpm test
pnpm build
pnpm verify:pack
```

## Licencia

MIT, copyright © 2026 Federico Bordón.