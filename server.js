// server.js
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", async (_req, res) => {
  console.log("🔍 GET / recibida");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log("SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0,10) + "…");

  // Prueba de query real:
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


app.put("/upsert-user/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const {
    Email: email,
    NameUser,
    Phone,
    CompanyId,
    RoleId,
    Area    // asegúrate de que este campo viene como array o null
  } = req.body;

  if (!email || !projectId) {
    return res.status(400).json({ error: "Faltan datos requeridos." });
  }

  try {
    // 1) Recuperar credenciales del proyecto
    const { data: project, error: projError } = await supabaseAdmin
      .from("Tproyects")
      .select("ProyectURL, ProyectServiceRole")
      .eq("ProyectId", projectId)
      .single();

    if (projError || !project) {
      return res.status(404).json({ error: "Proyecto no encontrado" });
    }

    // 2) Conectar al Supabase de ese proyecto
    const supabase = createClient(
      project.ProyectURL,
      project.ProyectServiceRole
    );

    // 3) Crear o actualizar en Auth
    const { data: listResult } = await supabase.auth.admin.listUsers();
    let authUser = listResult.users.find(u => u.email === email);
    let authUserId;

    if (!authUser) {
      // crear nuevo
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: "Temp123!",
        email_confirm: true,
      });
      if (createError) throw createError;
      authUserId = newUser.user.id;
    } else {
      // ya existe, solo actualizo pwd
      authUserId = authUser.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: "Temp123!" });
    }

    // 4) Upsert en la tabla interna TUser
    //    OJO: la PK es UserId y tu campo de correo en la tabla se llama Email
    const { error: dbError } = await supabase
      .from("TUser")
      .upsert(
        [
          {
            UserId:  authUserId,  // coincidencia con la columna PK
            Email:   email,       // coincidente con la columna Email
            NameUser,
            Phone,
            RoleId,
            CompanyId,
            Area,
          },
        ],
        { onConflict: ["UserId"] }
      );
  

    if (dbError) throw dbError;

    res.status(200).json({
      userId: authUserId,
      message: "Usuario creado/actualizado con contraseña temporal 'Temp123!'"
    });
  } catch (err) {
    console.error("❌ Exception capturada:", err);
    res.status(500).json({ error: err.message });
  }
});

export default app;
