import "dotenv/config";
import { getSolicitudes, getMensajesBySolicitud, updateSolicitudEstado, getUsuarios, addSolicitudMensaje } from "./server/db";
import { sendTelegram } from "./server/routes";

async function main() {
  try {
    console.log("[cron-manual] Revisando solicitudes sin respuesta por 48h...");
    const solicitudes = await getSolicitudes();
    const enProceso = solicitudes.filter(s => s.estado === "En Proceso");
    
    const usuarios = await getUsuarios();
    
    for (const sol of enProceso) {
      const mensajes = await getMensajesBySolicitud(String(sol.id));
      if (!mensajes || mensajes.length === 0) continue;
      
      const lastMsg = mensajes[mensajes.length - 1];
      const autorUser = usuarios.find(u => u.email === lastMsg.autor);
      
      if (autorUser && (autorUser.rol === "compras" || autorUser.rol === "admin")) {
        const msgDate = new Date(lastMsg.creadoEn || new Date());
        const now = new Date();
        const diffMs = now.getTime() - msgDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        
        if (diffHours >= 48) {
          console.log(`[cron-manual] Solicitud #${sol.id} sin respuesta por 48h. Cambiando a No Concretado.`);
          await updateSolicitudEstado(String(sol.id), "No Concretado");
          
          await addSolicitudMensaje({
            solicitudId: sol.id,
            autor: "sistema@local",
            autorNombre: "Sistema",
            mensaje: "La solicitud ha pasado al estado 'No Concretado' por falta de respuesta (48h).",
            source: "web"
          }).catch(console.error);

          const vendedorUser = usuarios.find(u => u.email === sol.vendedor);
          if (vendedorUser?.telegramChatId) {
            const msg = [
              `⚠️ <b>Solicitud #${sol.id} No Concretada</b>`,
              `<b>Producto:</b> ${sol.producto || ""}`,
              `<b>Cliente:</b> ${sol.cliente || ""}`,
              `<i>Han pasado 48 horas sin respuesta y la solicitud ha sido marcada como 'No Concretado'. Por favor revisa si necesitas reabrirla.</i>`
            ].join("\n");
            await sendTelegram(msg, vendedorUser.telegramChatId).catch((e: any) => console.log('Telegram fail:', e.message));
          }
        }
      }
    }
    console.log("[cron-manual] Proceso terminado.");
    process.exit(0);
  } catch (e: any) {
    console.error("[cron-manual] Error:", e.message);
    process.exit(1);
  }
}

main();
