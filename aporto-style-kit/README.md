# Aporto Style Kit 🎨

This kit contains the core design system and layout components for Aporto projects. Use it to maintain a consistent look and feel across subdomains or separate repositories.

## Contents
- `globals.css`: Core design tokens (colors, fonts, variables) and global resets.
- `components/`:
  - `DashboardLayout.tsx`: The main wrapper component.
  - `Sidebar.tsx`: The side navigation bar (adapted for standalone use).
  - `Header.tsx`: The top navigation/user menu.
  - `layout.module.css`: Styles for the layout components.

## How to use in a new Next.js project

1. **Install Dependencies**:
   Ensure you have `react` and `next` installed.

2. **Copy Files**:
   Copy the `globals.css` to your `src/app` (or `app`) directory.
   Copy the `components` folder into your project.

3. **Global CSS**:
   Import `globals.css` in your root `layout.tsx`:
   ```tsx
   import "./globals.css";
   ```

4. **Apply Layout**:
   Wrap your pages with `DashboardLayout`:
   ```tsx
   import DashboardLayout from "./components/DashboardLayout";

   export default function Page() {
     return (
       <DashboardLayout>
         <h1>Your New Page</h1>
         <p>This page shares the Aporto style.</p>
       </DashboardLayout>
     );
   }
   ```

5. **Customization**:
   - Update `Sidebar.tsx` to add your subdomain's navigation items.
   - Adjust `globals.css` variables if you want to tweak the primary colors.
