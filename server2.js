import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Cliente administrador de Supabase con Service Role Key
typedef = createClient({SUPABASE_URL}, {SUPABASE_SERVICE_ROLE_KEY})
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Ruta de prueba para verificar servidor corriendo
app.get('/', (req, res) => {
  res.send('🚀 Objetiva Server está corriendo');
});

// Eliminar usuario
app.delete('/delete-user/:projectId/:userId', async (req, res) => {
  const { projectId, userId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('supabase_url, service_role_key')
      .eq('proyectID', projectId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const supabase = createClient(data.supabase_url, data.service_role_key);
    await supabase.from('users').delete().eq('id', userId);
    await supabase.auth.admin.deleteUser(userId);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear o actualizar usuario
app.put('/upsert-user/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { correoElectronico, ...otrosCampos } = req.body;

  if (!correoElectronico || !projectId) {
    return res.status(400).json({ error: 'Faltan datos requeridos.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('supabase_url, service_role_key')
      .eq('proyectID', projectId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const supabase = createClient(data.supabase_url, data.service_role_key);
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    let authUser = existingUsers.users.find(u => u.email === correoElectronico);
    let authUserId = authUser?.id;

    if (!authUser) {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: correoElectronico,
        password: 'Temp123!',
        email_confirm: true,
      });
      if (createError) {
        return res.status(500).json({ error: createError.message });
      }
      authUserId = newUser.user.id;
    } else {
      await supabase.auth.admin.updateUserById(authUserId, { password: 'Temp123!' });
    }

    if (!authUserId) {
      return res.status(500).json({ error: 'No se pudo obtener el ID del usuario' });
    }

    await supabase.from('users').upsert([
      { id: authUserId, correoElectronico, ...otrosCampos }
    ]);

    res.status(200).json({ userId: authUserId, message: "Usuario creado/actualizado con contraseña temporal 'Temp123!'" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Levantar el servidor\const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
