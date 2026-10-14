export interface UIDropdownMenuItem {
    label: string;
    disabled?: boolean;
    onClick?: () => void;
    destructive?: boolean;
}

export interface UIDropdownMenuSection {
    title?: string;
    icon?: string;
    items: UIDropdownMenuItem[];
}