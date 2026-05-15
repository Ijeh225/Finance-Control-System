import React from 'react';
import { Text, TextProps } from 'react-native';

interface AmountTextProps extends TextProps {
  amount: number;
  variant?: 'default' | 'large';
}

export const AmountText: React.FC<AmountTextProps> = ({ amount, variant = 'default', style, ...props }) => {
  const formatCurrency = (num: number) => {
    if (variant === 'large' && Math.abs(num) >= 1000000) {
      return `₦${(num / 1000000).toFixed(2)}M`;
    }
    return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Text style={style} {...props}>
      {formatCurrency(amount)}
    </Text>
  );
};
