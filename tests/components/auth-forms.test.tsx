import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LoginForm } from "@/components/login-form";
import { LogoutButton } from "@/components/logout-button";
import { SignUpForm } from "@/components/sign-up-form";
import { UpdatePasswordForm } from "@/components/update-password-form";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
      updateUser: mocks.updateUser,
    },
  }),
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.signInWithPassword.mockReset();
  mocks.signOut.mockReset();
  mocks.signUp.mockReset();
  mocks.resetPasswordForEmail.mockReset();
  mocks.updateUser.mockReset();

  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});

describe("auth forms", () => {
  test("logs in with email and password", async () => {
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "secret-password",
      });
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  test("shows login errors", async () => {
    const user = userEvent.setup();
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error("Invalid login credentials"),
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "bad-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByText("Invalid login credentials"),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("rejects mismatched sign-up passwords", async () => {
    const user = userEvent.setup();

    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "one-password");
    await user.type(screen.getByLabelText("Repeat Password"), "other-password");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test("signs up with an email confirmation redirect", async () => {
    const user = userEvent.setup();

    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.type(screen.getByLabelText("Repeat Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "secret-password",
        options: {
          emailRedirectTo:
            "http://localhost:3000/auth/confirm?next=/dashboard",
        },
      });
    });
    expect(mocks.push).toHaveBeenCalledWith("/auth/sign-up-success");
  });

  test("sends a password reset email", async () => {
    const user = userEvent.setup();

    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset email" }));

    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        "person@example.com",
        {
          redirectTo: "http://localhost:3000/auth/update-password",
        },
      );
    });
    expect(screen.getByText("Reset email sent")).toBeInTheDocument();
    expect(screen.getByText("Sent to person@example.com.")).toBeInTheDocument();
  });

  test("updates the password", async () => {
    const user = userEvent.setup();

    render(<UpdatePasswordForm />);
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({
        password: "new-password",
      });
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  test("logs out", async () => {
    const user = userEvent.setup();

    render(<LogoutButton />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/auth/login");
  });
});
