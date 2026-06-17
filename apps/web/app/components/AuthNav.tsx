"use client";
import React from "react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function AuthNav() {
  return (
    <nav className="flex items-center justify-end gap-4">
      <SignInButton>
        <button className="btn">Sign in</button>
      </SignInButton>
      <SignUpButton>
        <button className="btn">Sign up</button>
      </SignUpButton>
    </nav>
  );
}
