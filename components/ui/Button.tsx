import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'plain' | 'destructive' | 'icon'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  small?: boolean
}
const cls: Record<Variant, string> = { primary: 'btn-primary', secondary: 'btn-secondary', plain: 'btn-plain', destructive: 'btn-destructive', icon: 'btn-icon' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', small, className = '', type = 'button', ...p }, ref) {
  return <button ref={ref} type={type} className={`btn ${cls[variant]} ${small ? 'btn-sm' : ''} ${className}`} {...p} />
})
