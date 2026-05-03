-- Insert users from CSV
-- Note: This uses ON CONFLICT to avoid duplicates on email

INSERT INTO usuarios (id, nombre, email, password, rol, activo, solicitudes, telegram_chat_id, creado_en) VALUES
(1, 'Juan Admin', 'juan@onprotec.com', 'admin123', 'admin', 'true', 'true', '663017538', NOW()),
(7, 'Milagros Morales', 'm.morales@onprotec.com', 'Global1410', 'contabilidad', 'true', 'false', NULL, NOW()),
(9, 'Carlos Martins', 'carlos@onprotec.com', 'Global1410', 'admin', 'true', 'true', NULL, NOW()),
(10, 'Armando Muñoz', 'a.munoz@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '592971617', NOW()),
(11, 'Maybelis Vera', 'm.vera@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1243385692', NOW()),
(12, 'Valentina Castillo', 'v.castillo@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1277072072', NOW()),
(13, 'Edil Gil', 'e.gil@onprotec.com', 'Global1410', 'contabilidad', 'true', 'false', NULL, NOW()),
(14, 'Nataly Diaz', 'n.diaz@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1569197614', NOW()),
(15, 'Yasibit Duarte', 'y.duarte@onprotec.com', 'Global1410', 'supervisor_caja', 'true', 'false', NULL, NOW()),
(16, 'Wendy García', 'w.garcia@onprotec.com', 'Global1410', 'cajero', 'true', 'false', NULL, NOW()),
(17, 'Roderick Romero', 'r.romero@onprotec.com', 'Global1410', 'cajero', 'true', 'false', NULL, NOW()),
(18, 'Yadhira Colmenares', 'y.colmenares@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1097821323', NOW()),
(19, 'Alejandro Betancourt', 'a.betancourt@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1701500044', NOW()),
(20, 'Igor Rivas', 'i.rivas@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '534836140', NOW()),
(21, 'José Sanabria', 'j.sanabria@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '2139269190', NOW()),
(22, 'Luis Daboin', 'l.daboin@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '1412902256', NOW()),
(23, 'Lisbeth Gonzalez', 'l.gonzalez@onprotec.com', 'Global1410', 'cajero', 'true', 'false', NULL, NOW()),
(24, 'Jesus Caterina', 'j.caterina@onprotec.com', 'Global1410', 'vendedor', 'true', 'true', '2116593597', NOW()),
(25, 'Julio Subero', 'j.subero@onprotec.com', 'Global1410', 'compras', 'true', 'true', '5900855032', NOW()),
(26, 'Jonathan Suniga', 'jo.suniaga@onprotec.com', 'Global1410', 'compras', 'true', 'true', '1186051927', NOW())
ON CONFLICT (email) DO NOTHING;
