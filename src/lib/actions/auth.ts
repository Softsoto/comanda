"use server";

import { redirect } from "next/navigation";
import { isReservedAdminEmail } from "@/lib/admin";
import { clientAddress, createSession, destroySession } from "@/lib/auth";
import { DEFAULT_CURRENCY, DEFAULT_PAYMENT_METHODS, LIMITS } from "@/lib/config";
import { createAccount, findUserByEmail, isUniqueViolation } from "@/lib/data";
import { isEmail, readText, type FormState } from "@/lib/form";
import { getDummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { joinWhatsapp, whatsappProblem } from "@/lib/phone";
import { clearAttempts, isLimited, recordAttempt } from "@/lib/rate-limit";

const signupOpen = () => process.env.ALLOW_SIGNUP !== "false";

export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!signupOpen()) return { message: "El registro de nuevas cuentas está cerrado." };

  const businessName = readText(formData, "businessName", LIMITS.businessName);
  const email = readText(formData, "email", 254).toLowerCase();
  const countryCode = readText(formData, "countryCode", 4);
  const phone = readText(formData, "phone", 24);
  const password = String(formData.get("password") ?? "");
  const whatsapp = joinWhatsapp(countryCode, phone);
  const values = { businessName, email, countryCode, phone };

  const errors: Record<string, string> = {};
  if (businessName.length < 2) errors.businessName = "Escribe el nombre de tu negocio.";
  if (!isEmail(email)) errors.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
  if (!whatsapp) errors.phone = "Escribe el número de WhatsApp donde recibirás los pedidos.";
  else if (whatsappProblem(whatsapp)) errors.phone = whatsappProblem(whatsapp) as string;
  const passwordError = passwordProblem(password);
  if (passwordError) errors.password = passwordError;
  if (Object.keys(errors).length > 0) return { errors, values };

  // Como mucho 8 registros cada 10 minutos desde la misma dirección.
  const signupKey = `registro:${await clientAddress()}`;
  if (isLimited(signupKey, 8)) return { message: "Demasiados intentos. Espera unos minutos y vuelve a probar.", values };
  recordAttempt(signupKey);

  const emailTaken: FormState = {
    errors: { email: "Ya existe una cuenta con ese correo. Entra con tu contraseña." },
    values,
  };
  if (await findUserByEmail(email)) return emailTaken;

  // Un correo de administración que aún no tiene cuenta no se puede registrar
  // desde aquí: así nadie se adelanta y se queda con el acceso a todo el servicio.
  // (La cuenta se crea primero y el correo se añade a ADMIN_EMAILS después.)
  if (isReservedAdminEmail(email)) {
    return { errors: { email: "Ese correo no se puede registrar desde aquí. Usa otro correo." }, values };
  }

  let userId: string;
  try {
    userId = await createAccount({
      email,
      passwordHash: await hashPassword(password),
      businessName,
      whatsapp,
      currency: DEFAULT_CURRENCY,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return emailTaken;
    throw error;
  }

  await createSession(userId);
  redirect("/panel");
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = readText(formData, "email", 254).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };
  if (!isEmail(email) || password.length === 0 || password.length > 200) {
    return { message: "Escribe tu correo y tu contraseña.", values };
  }

  // Dos límites: por cuenta (frena a quien prueba claves contra un correo) y
  // por dirección (frena a quien prueba muchos correos desde el mismo sitio).
  const accountKey = `entrar:cuenta:${email}`;
  const addressKey = `entrar:origen:${await clientAddress()}`;
  if (isLimited(accountKey, 8) || isLimited(addressKey, 40)) {
    return { message: "Demasiados intentos. Espera unos minutos y vuelve a probar.", values };
  }

  const user = await findUserByEmail(email);
  // Si el correo no existe se comprueba igual contra un hash de relleno,
  // para que la respuesta tarde lo mismo y no revele qué correos tienen cuenta.
  const valid = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !valid) {
    recordAttempt(accountKey);
    recordAttempt(addressKey);
    return { message: "Correo o contraseña incorrectos.", values };
  }

  clearAttempts(accountKey);
  await createSession(user.id);
  redirect("/panel");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
