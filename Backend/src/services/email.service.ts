import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export async function sendEmailAlert(subject: string, message: string) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass || !config.smtp.to) {
    throw new Error("SMTP config missing in .env");
  }

  const info = await transporter.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: config.smtp.to,
    subject,
    text: message,
  });

  return info;
}