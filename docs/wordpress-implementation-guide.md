# Guía de Implementación WordPress — tutecnoservicio.com

> Documento para el despliegue del sitio web de TecnoServicio en WordPress autoalojado sobre Proxmox VE.

---

## 1. Identidad Visual (Design Tokens)

### Paleta de colores
| Token | Hex | Uso |
|-------|-----|-----|
| Primary Dark | `#0D1C40` | Fondos hero, nav, footer |
| Primary Blue | `#1E3A8A` | Gradientes, degradados |
| Accent Orange | `#F97316` | CTAs, badges, acentos |
| Orange Light | `#FED7AA` | Textos sobre fondo oscuro |
| Surface | `#F8FAFF` | Fondos de secciones alternas |
| Blue Tint | `#EFF6FF` | Backgrounds de íconos y tags |
| Blue Tag | `#DBEAFE` | Chips de características |
| Text Primary | `#0D1C40` | Encabezados |
| Text Body | `#475569` | Párrafos |
| Text Muted | `#64748B` | Subtítulos, metadatos |
| Border | `#E2E8F0` | Bordes de tarjetas |

### Tipografía
- **Fuente principal:** Inter (Google Fonts)
  - URL: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap`
- **Títulos H1:** 56px / weight 800 / tracking -0.02em
- **Títulos H2:** 38–40px / weight 800 / tracking -0.02em
- **Títulos H3:** 18–22px / weight 700
- **Cuerpo:** 15–18px / weight 400–500 / line-height 1.7–1.8
- **Tags/badges:** 12–13px / weight 600–700

### Logos
- **Logo horizontal (header/footer):** `logo-horizontal.png` — usar sobre fondos oscuros
- **Isotipo cuadrado (favicon/ícono):** `isotipo.jpeg` — convertir a `.ico` para favicon

---

## 2. Infraestructura en Proxmox VE

### Requisitos del contenedor LXC o VM
```
Sistema operativo: Ubuntu 22.04 LTS
RAM mínima:        2 GB
Disco:             20 GB SSD
PHP:               8.2
MySQL/MariaDB:     10.6+
Nginx o Apache:    Última versión estable
```

### Stack recomendado: Nginx + PHP-FPM + MariaDB
```bash
# En el contenedor:
apt update && apt install -y nginx php8.2-fpm php8.2-mysql \
  php8.2-curl php8.2-gd php8.2-mbstring php8.2-xml \
  php8.2-zip mariadb-server certbot python3-certbot-nginx

# Base de datos
mysql_secure_installation
mysql -u root -p -e "CREATE DATABASE wp_tecnoservicio CHARACTER SET utf8mb4;"
mysql -u root -p -e "CREATE USER 'wp_user'@'localhost' IDENTIFIED BY 'CONTRASEÑA_SEGURA';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON wp_tecnoservicio.* TO 'wp_user'@'localhost'; FLUSH PRIVILEGES;"

# WordPress
cd /var/www
wget https://wordpress.org/latest.tar.gz
tar -xzf latest.tar.gz
mv wordpress tutecnoservicio.com
chown -R www-data:www-data tutecnoservicio.com
```

### Configuración Nginx mínima
```nginx
server {
    listen 80;
    server_name tutecnoservicio.com www.tutecnoservicio.com;
    root /var/www/tutecnoservicio.com;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }

    location ~ /\.ht { deny all; }
}
```

Obtener SSL:
```bash
certbot --nginx -d tutecnoservicio.com -d www.tutecnoservicio.com
```

---

## 3. Tema y Constructor Recomendado

### Opción A (Recomendada): Kadence Theme + Kadence Blocks
- **Tema base:** Kadence (gratuito en WordPress.org)
- **Constructor de bloques:** Kadence Blocks Pro (pago, ~$99/año) o versión gratuita
- **Por qué:** Rendimiento excelente, full-site editing, control fino de colores y tipografía, compatible con el diseño definido.

**Configuración de colores en Kadence:**
```
Palette Color 1: #0D1C40  (Primary Dark)
Palette Color 2: #1E3A8A  (Primary Blue)  
Palette Color 3: #F97316  (Accent Orange)
Palette Color 4: #F8FAFF  (Surface)
Palette Color 5: #EFF6FF  (Blue Tint)
Palette Color 6: #475569  (Text Body)
```

### Opción B (Alternativa gratuita): GeneratePress + GenerateBlocks
- Mismas capacidades, sin costo. Curva de aprendizaje similar.

### Opción C (Drag & Drop visual): Elementor Pro
- Más fácil para no desarrolladores, pero más pesado en rendimiento.
- Si se elige Elementor, instalar también **Elementor Pro** (~$99/año).

---

## 4. Plugins Esenciales

| Plugin | Función | Versión |
|--------|---------|---------|
| **WP Forms Lite** | Formulario de contacto | Gratis |
| **Rank Math SEO** | SEO completo, sitemaps | Gratis |
| **WP Rocket** *(o LiteSpeed Cache si el servidor es LiteSpeed)* | Caché y rendimiento | Pago ~$59/año |
| **Smush** | Compresión de imágenes automática | Gratis |
| **Wordfence Security** | Seguridad, firewall, 2FA | Gratis |
| **UpdraftPlus** | Backups automáticos | Gratis |
| **Redirection** | Gestión de redirects 301 | Gratis |
| **Classic Editor** *(opcional)* | Si se prefiere el editor clásico | Gratis |

### Configuración de WP Forms — Formulario de contacto
Campos del formulario:
1. Nombre de la empresa (texto, obligatorio)
2. Nombre del contacto (texto, obligatorio)
3. Correo electrónico (email, obligatorio)
4. Teléfono/WhatsApp (texto, opcional)
5. Tamaño de la empresa (selección: 1-10 / 11-50 / 51-200 / +200 empleados)
6. Servicio de interés (selección múltiple con los 5 servicios)
7. Descripción breve de la necesidad (área de texto)

Notificación de envío: `contacto@tutecnoservicio.com`

---

## 5. Estructura de Páginas y Menú

### Páginas a crear en WordPress
```
Inicio (página principal — landing completa)
├── /servicios/monitoreo-24-7
├── /servicios/soporte-remoto
├── /servicios/archivos-seguros
├── /servicios/desarrollo-aplicaciones
└── /servicios/seguridad-conectividad
Sobre nosotros (/sobre)
Cómo trabajamos (/proceso)
Blog (/blog)  ← opcional, para SEO futuro
Contacto (/contacto)
Política de privacidad (/privacidad)
```

### Menú principal (Header)
```
Servicios (dropdown)
Experiencia
Cómo trabajamos
Blog
Contacto [botón naranja]
```

### Menú Footer
```
Columna 1: Logo + tagline
Columna 2: Servicios (links)
Columna 3: Empresa (Sobre, Proceso, Blog)
Columna 4: Contacto (email, WhatsApp, LinkedIn)
```

---

## 6. Estructura de la Página de Inicio

Replicar las siguientes secciones en orden, usando los bloques del constructor elegido:

### Sección 1: Hero
- Fondo: gradiente lineal `135deg, #0D1C40 → #1E3A8A → #0D1C40`
- Badge: "Virtual CIO & Arquitecto de Soluciones" (fondo naranja 15% opacidad)
- H1: "Tecnología gestionada para que su empresa **opere sin fricciones**"
- Párrafo: descripción valor principal
- Botones: CTA primario naranja + CTA secundario transparente
- Estadísticas: 28 años / 11 años / 100% control / 24/7

### Sección 2: Servicios
- Fondo: `#F8FAFF`
- Grid 2 columnas, 5 tarjetas (última en ancho completo)
- Cada tarjeta: ícono en fondo `#EFF6FF` + título + subtítulo naranja + descripción + tags

### Sección 3: Sobre el especialista
- Fondo: blanco
- Layout: 2 columnas (visual izquierda, texto derecha)
- Visual: tarjeta oscura con años de experiencia + stack tecnológico
- Texto: propuesta de valor + lista de ventajas con ✓

### Sección 4: Cómo trabajamos
- Fondo: `#F8FAFF`
- Grid 4 columnas: Paso 01, 02, 03, 04
- Cada paso: número naranja + barra naranja + título + descripción

### Sección 5: Franja de confianza
- Fondo: `#0D1C40`
- 4 columnas: ícono + título en blanco + descripción muted

### Sección 6: CTA / Contacto
- Tarjeta con fondo gradiente sobre fondo `#F8FAFF`
- H2 + párrafo + 2 botones (email + WhatsApp)
- Formulario de WP Forms debajo

---

## 7. Configuración SEO (Rank Math)

### Meta datos de la página de inicio
```
Title:       Soporte TI Gestionado para Empresas | TecnoServicio
Description: Monitoreo 24/7, soporte remoto y soluciones tecnológicas a la medida. 
             28 años de experiencia. Virtual CIO para su empresa sin el costo de uno de planta.
Keywords:    soporte técnico empresarial, IT gestionado Venezuela, virtual CIO, 
             monitoreo 24/7, desarrollo de aplicaciones a la medida
```

### Open Graph (redes sociales)
```
OG Image:    logo-horizontal.png (1200x630px, fondo #0D1C40)
OG Title:    TecnoServicio — Tecnología Gestionada para Empresas
OG Type:     website
```

### Palabras clave objetivo por página de servicio
- Monitoreo: "monitoreo de servidores 24/7", "RMM para pymes"
- Soporte: "soporte técnico remoto empresas", "help desk externo"
- Archivos: "almacenamiento privado empresas", "Nextcloud autoalojado"
- Desarrollo: "desarrollo de aplicaciones empresariales Venezuela", "integración Odoo"
- Seguridad: "seguridad perimetral empresas", "VPN corporativa WatchGuard"

---

## 8. Rendimiento y Caché

### wp-config.php — ajustes importantes
```php
define('WP_MEMORY_LIMIT', '256M');
define('WP_MAX_MEMORY_LIMIT', '512M');
define('WP_DEBUG', false);
define('COMPRESS_CSS', true);
define('COMPRESS_SCRIPTS', true);
define('CONCATENATE_SCRIPTS', true);
define('ENFORCE_GZIP', true);
```

### php.ini — límites recomendados
```ini
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 300
memory_limit = 256M
```

### WP Rocket — configuración básica
- ✅ Caché de páginas habilitado
- ✅ Minificar CSS y JS
- ✅ Lazy load de imágenes
- ✅ Prefetch DNS
- ❌ CDN (no necesario si el servidor es local/regional)

---

## 9. Integración con Tailscale (acceso admin desde cualquier lugar)

Si el contenedor WordPress está en red privada Proxmox:
```bash
# Instalar Tailscale en el contenedor
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=<tu-auth-key> --hostname=wp-tecnoservicio

# Acceder al admin WordPress vía:
# http://wp-tecnoservicio:80/wp-admin
# (sin exponer el puerto 80 al público)
```

El dominio `tutecnoservicio.com` apunta a la IP pública → Nginx → WordPress.
El panel admin solo es accesible vía Tailscale para mayor seguridad.

---

## 10. Checklist de Lanzamiento

- [ ] Dominio `tutecnoservicio.com` apuntando al servidor (A record)
- [ ] SSL activo (Let's Encrypt via Certbot)
- [ ] WordPress instalado y configurado
- [ ] Tema Kadence + Kadence Blocks instalado y activado
- [ ] Paleta de colores e Inter configurados en el tema
- [ ] Logo horizontal subido como logo del sitio
- [ ] Isotipo subido como favicon (convertir a .ico)
- [ ] Página de inicio construida con todas las secciones
- [ ] Páginas de servicios individuales creadas
- [ ] Formulario de contacto activo y enviando notificaciones
- [ ] Rank Math configurado con meta datos
- [ ] WP Rocket activo con caché habilitado
- [ ] Wordfence instalado y escaneado inicial realizado
- [ ] UpdraftPlus configurado con backup automático semanal
- [ ] Prueba de velocidad en GTmetrix o PageSpeed Insights
- [ ] Prueba en móvil (Chrome DevTools responsive mode)
- [ ] Formulario de contacto probado end-to-end
- [ ] Google Analytics / Plausible configurado (opcional)
- [ ] Sitemap enviado a Google Search Console

---

## 11. Notas Adicionales

### Imágenes de la marca
Los archivos de logo se encuentran en el repositorio del proyecto:
- `logo-horizontal.png` — para header y footer (sobre fondos oscuros)
- `isotipo.jpeg` — para favicon y usos compactos

Para el favicon: convertir el isotipo a `.ico` usando [favicon.io](https://favicon.io/) o:
```bash
convert isotipo.jpeg -resize 32x32 favicon.ico
```

### Contacto en el sitio
Reemplazar los placeholders antes del lanzamiento:
- Email: `contacto@tutecnoservicio.com`
- WhatsApp: número real con prefijo `https://wa.me/58424XXXXXXX`
- LinkedIn: URL del perfil profesional

### Actualizaciones futuras
WordPress + plugins deben actualizarse regularmente. Recomendado:
- Activar actualizaciones automáticas de seguridad
- Revisar actualizaciones mayores manualmente
- Respaldar antes de cualquier actualización mayor
