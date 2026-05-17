# Guía de Contribución

## Configuración del entorno

```bash
git clone https://github.com/Utmostbrian/Atlas_Veterinario_UDI.git
cd Atlas_Veterinario_UDI
npm install
cp .env.example .env   # completar con valores de Supabase
npm run dev            # http://localhost:3000
```

## Secrets necesarios en Supabase

Para que las Edge Functions funcionen en local, configurar en Supabase Dashboard → Edge Functions → Manage secrets:

- `ANTHROPIC_API_KEY`
- `STUDENT_CLASS_CODE`
- `STUDENT_ACCOUNT_PASSWORD`

Para desarrollo local de la IA sin Edge Function, se puede usar `VITE_ANTHROPIC_API_KEY` en `.env`.

## Estructura del proyecto

```
src/
├── components/    # Componentes React por módulo
├── context/       # AuthContext (JWT + roles)
├── data/          # drugs.js (Atlas) y drugsDatabase.js (Calculadora)
├── hooks/         # useDrugCalculator, useChat, useLocalStorage
├── services/      # anthropicService, auditService
├── utils/         # markdownToHtml (utilidad compartida)
└── test/          # setup de tests
supabase/
├── functions/     # anthropic-proxy, student-login (Deno)
└── migrations/    # SQL de esquema y funciones
```

## Convención de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nueva funcionalidad
fix: corrección de bug
refactor: refactorización sin cambio de comportamiento
docs: solo documentación
test: añadir o modificar tests
chore: tareas de mantenimiento (deps, CI, etc.)
```

Ejemplo: `fix: validar concentración negativa en calculadora de dosis`

## Antes de hacer un PR

```bash
npm run lint    # debe pasar sin errores
npm test        # todos los tests deben pasar
npm run build   # el build debe completarse sin errores
```

## Reglas de seguridad

- **Nunca** commitear `.env`, claves de API ni contraseñas
- La API Key de Anthropic vive **solo** en Supabase Secrets
- Los scripts de administración en `scripts/` están en `.gitignore` por contener credenciales locales

## Datos de fármacos

Al añadir un fármaco nuevo, actualizarlo en **ambos** archivos para mantener la consistencia:

1. `src/data/drugs.js` — datos visuales del Atlas (nombre, descripción, dosis en formato legible)
2. `src/data/drugsDatabase.js` — datos clínicos de la calculadora (rangos de dosis, rutas, concentraciones)

En modo `npm run dev`, la consola avisa si un fármaco de la calculadora no está en el Atlas.
