/* This code is used to decrypt my email address. This is just done to prevent bots from scraping it. */

const emailBase64 = "anVzdHp2YW5AanVzdHp2YW4ueHl6";

const emailButton = document.getElementById("email-button");

emailButton.addEventListener("click", () => {
  const email = atob(emailBase64);
  
  window.location.href = `mailto:${email}`;
});