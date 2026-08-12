import { getSolicitudes, getMensajesBySolicitud, updateSolicitudEstado, getUsuarios, addSolicitudMensaje } from "./db";

export async function runCronJobOnce() {
  try {
    console.log("[cron] Revisando solicitudes sin respuesta por 48h...");
    const solicitudes = await getSolicitudes();
    const enProceso = solicitudes.filter(s => s.estado === "En Proceso");
    
    const usuarios = await getUsuarios();
    
    for (const sol of enProceso) {
      const mensajes = await getMensajesBySolicitud(String(sol.id));
      if (!mensajes || mensajes.length === 0) continue;
      
      // El último mensaje
      const lastMsg = mensajes[mensajes.length - 1];
      
      // Verificar si el autor del último mensaje es de compras
      const autorUser = usuarios.find(u => u.email === lastMsg.autor);
      if (autorUser && (autorUser.rol === "compras" || autorUser.rol === "admin")) {
        // Si el último mensaje es de compras, verificar si pasaron 48 horas
        const msgDate = new Date(lastMsg.creadoEn || new Date());
        const now = new Date();
        const diffMs = now.getTime() - msgDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        
        if (diffHours >= 48) {
          console.log(`[cron] Solicitud #${sol.id} sin respuesta por 48h. Cambiando a No Concretado.`);
          await updateSolicitudEstado(String(sol.id), "No Concretado");
          
          // Agregar mensaje de sistema
          await addSolicitudMensaje({
            solicitudId: sol.id,
            autor: "sistema@local",
            autorNombre: "Sistema",
            mensaje: "La solicitud ha pasado al estado 'No Concretado' por falta de respuesta (48h).",
            source: "web"
          }).catch(console.error);

          // Notificar al vendedor por Telegram
          const vendedorUser = usuarios.find(u => u.email === sol.vendedor);
          if (vendedorUser?.telegramChatId) {
            const { sendTelegram } = require("./routes");
            const msg = [
              `⚠️ <b>Solicitud #${sol.id} No Concretada</b>`,
              `<b>Producto:</b> ${sol.producto || ""}`,
              `<b>Cliente:</b> ${sol.cliente || ""}`,
              `<i>Han pasado 48 horas sin respuesta y la solicitud ha sido marcada como 'No Concretado'. Por favor revisa si necesitas reabrirla.</i>`
            ].join("\n");
            await sendTelegram(msg, vendedorUser.telegramChatId).catch(() => {});
          }
        }
      }
    }
    return { success: true, message: "Revisión completada" };
  } catch (e: any) {
    console.error("[cron] Error en job de 48h:", e.message);
    return { success: false, error: e.message };
  }
}

export function startCronJobs() {
  // Ejecutar cada 1 hora (3600000 ms)
  setInterval(async () => {
    await runCronJobOnce();
  }, 3600 * 1000);
}
