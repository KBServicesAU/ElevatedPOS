export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalCount: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface ApiResponse<T> {
  data: T;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserSession {
  employeeId: string;
  orgId: string;
  locationIds: string[];
  roleId: string;
  permissions: string[];
  name: string;
  email: string;
}
