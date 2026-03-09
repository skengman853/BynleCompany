import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="helper">
        Use the admin email and password created for your tenant.
      </p>
      <LoginForm />
    </div>
  );
}
