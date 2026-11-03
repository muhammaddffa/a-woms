export interface AuthRole {
  code: string;
  name: string;
}

// Data user yang menempel di request setelah token diverifikasi.
// Diambil dari database di setiap request, sehingga perubahan role/permission
// dan penonaktifan akun langsung berlaku tanpa menunggu token kedaluwarsa.
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roles: AuthRole[];
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
}

export interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}
