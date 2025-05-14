
// server.js
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
//import serverless from "@vendia/serverless-express";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Función reutilizable para insertar/actualizar usuarios en Supabase
async function handleUserUpsert({
  projectId,
  userData,
  tableName,
  conflictKey = "UserId"
}) {
  // Obtener credenciales del proyecto desde la tabla central
  const { data: project, error: projError } = await supabaseAdmin
    .from("Tproyects")
    .select("ProyectURL, ProyectServiceRole")
    .eq("ProyectId", projectId)
    .single();

  if (projError || !project) {
    throw new Error("Proyecto no encontrado");
  }
  //conectar al supabase de ese proyecto
  const supabase = createClient(project.ProyectURL, project.ProyectServiceRole);

  // Buscar usuario en Auth
  const { data: listResult } = await supabase.auth.admin.listUsers();
  const correoKey = userData.correoElectronico || userData.Email || userData.correo;;
  let authUser = listResult.users.find(u => u.email === correoKey);
  let authUserId;

  if (!authUser) {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: correoKey,
      password: "Temp123!",
      email_confirm: true,
    });
    if (createError) throw createError;
    authUserId = newUser.user.id;
  } else {
    authUserId = authUser.id;
    await supabase.auth.admin.updateUserById(authUserId, { password: "Temp123!" });
  }

  // Hacer upsert con el usuario en la tabla correspondiente
  const upsertPayload = {
    [conflictKey]: authUserId,
    ...userData
  };

  const { error: dbError } = await supabase
    .from(tableName)
    .upsert([upsertPayload], { onConflict: [conflictKey] });

  if (dbError) throw dbError;

  return { userId: authUserId };
}

// Ruta base
app.get("/", async (_req, res) => {
  console.log("🔍 GET / recibida");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log("SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0,10) + "…");

  const { data, error } = await supabaseAdmin
    .from("Tproyects")
    .select("*");
  if (error) {
    console.error("❌ Error en test query:", error.message);
  } else {
    console.log("✅ Test query devuelve:", data);
  }

  res.send("🚀 Objetiva Server está corriendo");
});

// Ruta para la primera base de datos
app.put("/upsert-user/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const {
    Email: email,
    NameUser,
    Phone,
    CompanyId,
    RoleId,
    Area
  } = req.body;

  if (!email || !projectId) {
    return res.status(400).json({ error: "Faltan datos requeridos." });
  }
  //la tabla para el sistema ModeloObjetiva
  try {
    const result = await handleUserUpsert({
      projectId,
      tableName: "TUser",
      conflictKey: "UserId",
      userData: {
        Email: email,
        NameUser,
        Phone,
        CompanyId,
        RoleId,
        Area,
      }
    });

    res.status(200).json({
      ...result,
      message: "Usuario creado/actualizado (TUser)."
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para actualizar o crear usuarios de la segunda base de datos CRM (estructura alternativa)
app.put("/upsert-user-alt/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const {
    correoElectronico:email,
    nombreCompleto,
    celular,
    empresa,
    rol
  } = req.body;

  if (!email || !projectId) {
    return res.status(400).json({ error: "Faltan datos requeridos." });
  }

  try {
    const result = await handleUserUpsert({
      projectId,
      tableName: "users",       // nombre de la tabla en segunda BD
      conflictKey: "id",   // PK en la segunda BD
      userData: {
        correoElectronico:email,
        nombreCompleto,
        celular,
        empresa,
        rol
      }
    });

    res.status(200).json({
      ...result,
      message: "Usuario creado/actualizado (TUserAlt)."
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para eliminar un usuario del CRM
app.delete('/delete-user-alt/:projectId/:userId', async (req, res) => {
  const { projectId, userId } = req.params;
  try {
    const { data: project, error: projError } = await supabaseAdmin
      .from('Tproyects') // Usamos tu tabla central de proyectos 'Tproyects'
      .select('ProyectURL, ProyectServiceRole')
      .eq('ProyectId', projectId) // Buscamos el proyecto por ProyectId
      .single();

    if (projError || !project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const supabase = createClient(project.ProyectURL, project.ProyectServiceRole);

    // Eliminar el usuario de tu tabla de usuarios (ej: 'users' o 'TUser')
    const { error: userDeleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId); // Asumiendo que el userId en tu tabla es 'id'

    if (userDeleteError) {
      console.error("Error al eliminar usuario de la tabla:", userDeleteError);
      return res.status(500).json({ error: 'Error al eliminar usuario de la tabla' });
    }

    // Eliminar el usuario de la autenticación de Supabase
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error("Error al eliminar usuario de la autenticación:", authDeleteError);
      return res.status(500).json({ error: 'Error al eliminar usuario de la autenticación' });
    }

    res.sendStatus(204); // Respuesta exitosa sin contenido
  } catch (err) {
    console.error("Error al eliminar usuario:", err);
    res.status(500).json({ error: err.message });
  }
});

export default app;

