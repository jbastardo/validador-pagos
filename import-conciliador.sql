INSERT INTO usuarios (nombre, email, password, rol, activo, "creado_en")
VALUES
  ('Juan Admin', 'juan@onprotec.com', 'admin123', 'admin', 'true', NOW()),
  ('Nataly Díaz', 'n.diaz@onprotec.com', 'Global1410', 'operador', 'true', NOW()),
  ('Carlos Martins', 'carlos@onprotec.com', 'Global1410', 'gerencia', 'true', NOW()),
  ('Milagros Morales', 'm.morales@onprotec.com', 'Global1410', 'operador', 'true', NOW())
ON CONFLICT (email) DO NOTHING;