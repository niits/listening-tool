# Coding Guidelines for React and Next.js

Standards for consistent, maintainable code generation.

## General Principles

- Prioritize readability, maintainability, and reusability
- Use descriptive naming for variables, functions, components, and files
- Extract reusable logic into functions, custom hooks, or components (DRY)
- Break complex features into smaller units
- Write all new code in TypeScript
- Design for testability
- Use yarn for package management
- Store documentation in `docs` folder

### Guidelines

- Co-locate logic that changes together
- Group code by feature, not by type
- Separate UI, logic, and data fetching
- Maintain type safety across the entire stack
- Separate product logic from infrastructure
- Design for easy replacement and deletion
- Minimize changes required to extend features
- Functions should do one thing well with single abstraction level
- Minimize API surface area
- Favor pure functions for testability
- Use descriptive names over brevity

---

## React Guidelines

### Component Design

- Use functional components with hooks (avoid class components except error boundaries)
- Maintain single responsibility per component
- Use PascalCase for component names
- Use camelCase for prop names and destructure in function signature
- Define TypeScript interfaces for all props
- Never mutate props or state directly
- Use fragments to avoid unnecessary DOM wrappers
- Extract reusable stateful logic into custom hooks
- Use shadcn/ui for UI components

### State Management

- Use `useState` for component-level state
- Use Context API or dedicated libraries (Zustand, Redux, Jotai) for global state
- Avoid prop drilling

### Styling

- Use Tailwind CSS v4+
- Ensure scoped styles to prevent conflicts

### Performance

- Provide unique, stable keys when mapping lists (avoid array indices)
- Use `React.lazy` and `Suspense` for code splitting

---

## Next.js Guidelines

### Data Fetching

- Use App Router for new development
- Prioritize Server Components for data fetching
- Use `fetch` with `revalidate` for static/infrequent data
- Use Server Components for dynamic data
- Avoid client-side data fetching for initial loads
- Initiate parallel requests for independent data sources

### Routing

- Use file-system routing conventions
- Use route groups `(folderName)` for organization
- Define dynamic routes with `[slug]` syntax
- Use `middleware.ts` for auth and global request handling

### Optimization

- Use `next/image` for all images
- Use `next/font` for font optimization
- Use `next/dynamic` for lazy loading

### Project Structure

- Colocate component files within feature folders
- Extract utilities and helpers to `lib/` folder
- Use underscore-prefixed folders for non-route files
- Avoid barrel files - import directly from source files

### SEO & Accessibility

- Use `generateMetadata` for SEO in App Router
- **Accessibility:** Emphasize semantic HTML, ARIA attributes, and keyboard navigation.

### TypeScript

- **Strict Mode:** Ensure `strict: true` is enabled in `tsconfig.json`.
- **Type Definitions:** Provide accurate type definitions for API responses, props, and state.
- **Type Organization:** When generating TypeScript types or interfaces in this project, always place them in the `types/` folder with a descriptive filename (e.g. `user.ts`, `post.ts`). Do not define types or interfaces inside components.

---

## Example of How Copilot Should Respond

- **Given:** `// Create a simple React functional component for a button.`
- **Expected Output:** A functional component using `PascalCase`, with a `React.FC` type, props destructuring, and appropriate event handlers, kept as concise as possible.
- **Given:** `// Implement a Next.js API route to fetch products.`
- **Expected Output:** A route handler (or API route in `pages/api`) that demonstrates server-side data fetching, proper error handling, and potentially uses server-only context for sensitive operations. Any complex data transformation should be suggested in a separate utility function.
- **Given:** `// Refactor this component to use a custom hook for form validation.`
- **Expected Output:** A new file for a `useForm` hook, and the original component updated to utilize the hook. Any specific validation logic should be suggested in a helper function within `utils/validation.ts`.
