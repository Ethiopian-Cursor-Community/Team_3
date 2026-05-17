import app from "./webhook";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CI Fixer running on port ${PORT}`);
});