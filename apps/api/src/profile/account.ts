// Pure functions about a user's account: no database, no network.

// The columns of the users table that the API reads.
// Names use snake_case because that is how Postgres returns them.
export interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  age_confirmed_at: Date | null;
}

// What the API sends to the account's OWNER. It contains the email and last
// name, so it must never be used to show one user to another user.
export interface AccountJson {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  isAdult: boolean;
  complete: boolean;
}

// An account is complete once the user has given their name and confirmed
// they are 18 or older. The bio is optional.
export function isAccountComplete(user: UserRow): boolean {
  return (
    user.first_name !== null &&
    user.last_name !== null &&
    user.age_confirmed_at !== null
  );
}

// Converts a database row (snake_case) to the JSON the app receives (camelCase).
export function toAccountJson(user: UserRow): AccountJson {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    bio: user.bio,
    // The app only needs yes/no, not the date they confirmed.
    isAdult: user.age_confirmed_at !== null,
    complete: isAccountComplete(user),
  };
}
